#!/usr/bin/env python3
"""
Re-extract design data for 97 brands with incorrect #000000 background.
Sends batches of 3 concurrent requests to avoid overwhelming the server.
"""

import json
import asyncio
import aiohttp
import time
import sys

PREBUILT_PATH = "/Users/ojiro/claude-hacks/style-extractor/prebuilt.json"
API_URL = "http://localhost:8765/api/extract"
BATCH_SIZE = 3
TIMEOUT_SECONDS = 120  # Some sites take 30+ seconds

BRANDS = [
    "stripe.com", "figma.com", "netflix.com", "spotify.com", "shopify.com",
    "framer.com", "slack.com", "canva.com", "loom.com", "line.me",
    "smarthr.jp", "freee.co.jp", "wantedly.com", "rakuten.co.jp", "thebase.com",
    "sansan.com", "pinterest.jp", "intercom.com", "wise.com", "tiktok.com",
    "youtube.com", "zoom.us", "dropbox.com", "atlassian.com", "twilio.com",
    "cloudflare.com", "gitlab.com", "hashicorp.com", "medium.com", "reddit.com",
    "oracle.com", "databricks.com", "snowflake.com", "mongodb.com", "pexels.com",
    "layers.to", "instacart.com", "uber.com", "etsy.com", "uniqlo.com",
    "louisvuitton.com", "newbalance.com", "hermes.com", "warbyparker.com",
    "patagonia.com", "paypal.com", "robinhood.com", "brex.com", "mercury.com",
    "affirm.com", "marqeta.com", "bmw.com", "crunchyroll.com", "porsche.com",
    "deliveroo.com", "sweetgreen.com", "yahoo.co.jp", "dena.com", "abema.tv",
    "clickup.com", "monday.com", "asana.com", "codepen.io", "fly.io",
    "aws.amazon.com", "digitalocean.com", "segment.com", "amplitude.com",
    "dbt.com", "neon.tech", "planetscale.com", "signal.org", "midjourney.com",
    "perplexity.ai", "tripadvisor.com", "hilton.com", "khanacademy.org",
    "headspace.com", "peloton.com", "udemy.com", "techcrunch.com", "grubhub.com",
    "mixi.jp", "wired.com", "pitch.com", "krisp.ai", "spline.design",
    "rive.app", "sanity.io", "prismic.io", "strapi.io", "ghost.org",
    "wix.com", "deno.com", "astro.build", "angular.dev", "tailwindcss.com",
]

async def extract_brand(session, domain, url, semaphore):
    """Extract design data for a single brand."""
    async with semaphore:
        try:
            print(f"  -> Extracting {domain} ({url})...", flush=True)
            start = time.time()
            timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
            async with session.post(API_URL, json={"url": url}, timeout=timeout) as resp:
                elapsed = time.time() - start
                if resp.status == 200:
                    data = await resp.json()
                    new_bg = data.get("design", {}).get("colors", {}).get("bg", "???")
                    print(f"  <- {domain}: OK ({elapsed:.1f}s) bg={new_bg}", flush=True)
                    return domain, data, None
                else:
                    text = await resp.text()
                    print(f"  <- {domain}: HTTP {resp.status} ({elapsed:.1f}s): {text[:100]}", flush=True)
                    return domain, None, f"HTTP {resp.status}"
        except asyncio.TimeoutError:
            print(f"  <- {domain}: TIMEOUT ({TIMEOUT_SECONDS}s)", flush=True)
            return domain, None, "TIMEOUT"
        except Exception as e:
            print(f"  <- {domain}: ERROR: {e}", flush=True)
            return domain, None, str(e)

async def main():
    # Load prebuilt.json
    print(f"Loading {PREBUILT_PATH}...")
    with open(PREBUILT_PATH) as f:
        prebuilt = json.load(f)

    # Build URL map from prebuilt.json
    url_map = {}
    missing = []
    for domain in BRANDS:
        entry = prebuilt.get(domain)
        if entry and "design" in entry and "url" in entry["design"]:
            url_map[domain] = entry["design"]["url"]
        else:
            missing.append(domain)
            # Fallback URL
            url_map[domain] = f"https://{domain}"

    if missing:
        print(f"Warning: {len(missing)} brands missing from prebuilt.json, using fallback URLs: {missing}")

    print(f"\nStarting re-extraction of {len(BRANDS)} brands (batch size={BATCH_SIZE})...\n")

    # Track results
    results = {"success": [], "failed": [], "changed_bg": [], "still_dark": [], "genuinely_dark": []}
    old_bgs = {}

    # Record old bg colors
    for domain in BRANDS:
        entry = prebuilt.get(domain, {})
        old_bg = entry.get("design", {}).get("colors", {}).get("bg", "N/A")
        old_bgs[domain] = old_bg

    # Process in batches with semaphore for concurrency control
    semaphore = asyncio.Semaphore(BATCH_SIZE)

    connector = aiohttp.TCPConnector(limit=BATCH_SIZE)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for domain in BRANDS:
            url = url_map[domain]
            tasks.append(extract_brand(session, domain, url, semaphore))

        completed = 0
        total = len(tasks)

        for coro in asyncio.as_completed(tasks):
            domain, data, error = await coro
            completed += 1

            if error:
                results["failed"].append((domain, error))
                print(f"  [FAIL {completed}/{total}] {domain}: {error}")
                continue

            results["success"].append(domain)

            # Update prebuilt entry
            if domain in prebuilt:
                prebuilt[domain]["design"] = data["design"]
                formats = data.get("formats", {})
                if "DESIGN.md" in formats:
                    prebuilt[domain]["designMd"] = formats["DESIGN.md"]
                if "tailwind.config.js" in formats:
                    prebuilt[domain]["tailwind"] = formats["tailwind.config.js"]
                if "css-variables.css" in formats:
                    prebuilt[domain]["cssVars"] = formats["css-variables.css"]
                if "design-tokens.json" in formats:
                    prebuilt[domain]["tokens"] = formats["design-tokens.json"]

            # Track bg color changes
            new_bg = data.get("design", {}).get("colors", {}).get("bg", "???")
            old_bg = old_bgs.get(domain, "N/A")

            if old_bg == "#000000" and new_bg != "#000000":
                results["changed_bg"].append((domain, old_bg, new_bg))
            elif new_bg == "#000000":
                results["still_dark"].append(domain)

            print(f"  [{completed}/{total}] {domain}: {old_bg} -> {new_bg}")

    # Save updated prebuilt.json
    print(f"\nSaving updated {PREBUILT_PATH}...")
    with open(PREBUILT_PATH, "w") as f:
        json.dump(prebuilt, f, indent=2, ensure_ascii=False)
    print("Saved.")

    # Print summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Total brands: {len(BRANDS)}")
    print(f"Successful extractions: {len(results['success'])}")
    print(f"Failed extractions: {len(results['failed'])}")
    print(f"Background changed (was #000000, now different): {len(results['changed_bg'])}")
    print(f"Still #000000 (genuinely dark): {len(results['still_dark'])}")

    if results["changed_bg"]:
        print(f"\n--- CHANGED from #000000 ({len(results['changed_bg'])}) ---")
        for domain, old, new in sorted(results["changed_bg"]):
            print(f"  {domain}: {old} -> {new}")

    if results["still_dark"]:
        print(f"\n--- GENUINELY DARK (still #000000) ({len(results['still_dark'])}) ---")
        for domain in sorted(results["still_dark"]):
            print(f"  {domain}")

    if results["failed"]:
        print(f"\n--- FAILED ({len(results['failed'])}) ---")
        for domain, error in sorted(results["failed"]):
            print(f"  {domain}: {error}")

    # Quality check: verify final state
    print("\n" + "=" * 70)
    print("QUALITY CHECK - Final bg colors for all 97 brands")
    print("=" * 70)

    dark_count = 0
    light_count = 0
    failed_count = len(results["failed"])

    for domain in BRANDS:
        entry = prebuilt.get(domain, {})
        bg = entry.get("design", {}).get("colors", {}).get("bg", "N/A")
        if bg == "#000000":
            dark_count += 1
        else:
            light_count += 1

    print(f"Non-black background: {light_count}")
    print(f"Black background (#000000): {dark_count}")
    print(f"Failed (unchanged): {failed_count}")

if __name__ == "__main__":
    asyncio.run(main())
