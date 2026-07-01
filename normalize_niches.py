#!/usr/bin/env python3
"""
Collapse the fragmented free-text niches into ~12 clean categories so the filter
chips are useful (e.g. gym / Gym / gym/fitness / fitness/gym -> "Fitness & Gyms").
Updates business_cases.niche in place. No re-embedding needed.

  python normalize_niches.py
"""

import config

# First matching rule wins. Keywords are matched against the lowercased niche.
RULES = [
    (("gym", "fitness"), "Fitness & Gyms"),
    (("agency", "agencies"), "Agencies"),
    (("saas", "software", "app ", "platform", "tech"), "SaaS & Software"),
    (("ecommerce", "e-commerce", "commerce", "subscription", "dtc", "apparel",
      "fashion", "lingerie", "retail", "store", "consumer", "product brand"), "E-commerce & Retail"),
    (("coach", "course", "education", "academy", "info product", "consult", "mastermind"), "Coaching & Education"),
    (("real estate", "realtor", "property", "mortgage"), "Real Estate"),
    (("medical", "dental", "dentist", "chiro", "clinic", "health", "therapy",
      "med spa", "wellness", "doctor", "podiat", "care"), "Health & Medical"),
    (("hvac", "plumb", "roof", "cleaning", "contractor", "home service", "landscap",
      "pest", "trade", "construction", "duct"), "Home & Trade Services"),
    (("restaurant", "food", "cafe", "hospitality", "salon", "spa", "beauty"), "Local & Hospitality"),
    (("marketing", "advertis", " ads", "lead gen", "seo", "ppc"), "Marketing"),
    (("finance", "financ", "accounting", "insurance", "loan", "capital", "invest"), "Finance"),
    (("sales",), "Sales"),
    (("supplement", "cpg"), "Supplements & CPG"),
]


def canon(niche):
    s = (niche or "").lower().strip()
    if not s or s in ("other", "unspecified", "unknown", "general", "n/a"):
        return "Other / general"
    for keys, label in RULES:
        if any(k in s for k in keys):
            return label
    return niche.strip()[:40]


def main():
    sb = config.supabase_client()
    rows, start = [], 0
    while True:
        d = sb.table("business_cases").select("id,niche").range(start, start + 999).execute().data or []
        rows += d
        if len(d) < 1000:
            break
        start += 1000
    print(f"{len(rows)} rows")

    # group by distinct old niche -> update all at once per distinct value
    remap = {}
    for r in rows:
        remap.setdefault(r["niche"], canon(r["niche"]))
    changed = {old: new for old, new in remap.items() if old != new}
    print(f"{len(remap)} distinct niches -> normalizing {len(changed)} of them")

    for old, new in changed.items():
        # match rows with this exact old value (None handled separately)
        q = sb.table("business_cases").update({"niche": new})
        q = q.is_("niche", "null") if old is None else q.eq("niche", old)
        q.execute()
    print("Done.")


if __name__ == "__main__":
    main()
