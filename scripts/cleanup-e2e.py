#!/usr/bin/env python3
"""Delete all E2E test data from the Ottomate database via API."""

import json
import urllib.request

BASE = "http://localhost:3000/api"


def fetch(url):
    return json.loads(urllib.request.urlopen(url).read())


def delete(url):
    req = urllib.request.Request(url, method="DELETE")
    return urllib.request.urlopen(req).read()


# --- Templates ---
templates = fetch(f"{BASE}/templates")
e2e_templates = [
    t for t in templates
    if "E2E" in t.get("name", "")
    or "e2e" in t.get("name", "").lower()
    or "test template" in t.get("description", "").lower()
]
print(f"Templates: {len(e2e_templates)} E2E to delete (of {len(templates)} total)")
for t in e2e_templates:
    delete(f'{BASE}/templates?id={t["id"]}')
print(f"  Deleted {len(e2e_templates)} templates")

# --- Pipelines ---
data = fetch(f"{BASE}/pipelines")
pipelines = data.get("pipelines", data) if isinstance(data, dict) else data
e2e_pipelines = [
    p for p in pipelines
    if "E2E" in p.get("name", "")
    or "e2e" in p.get("name", "").lower()
    or "UI Test" in p.get("name", "")
]
print(f"Pipelines: {len(e2e_pipelines)} E2E to delete (of {len(pipelines)} total)")
for p in e2e_pipelines:
    delete(f'{BASE}/pipelines?id={p["id"]}')
print(f"  Deleted {len(e2e_pipelines)} pipelines")

# --- Skills ---
skills = fetch(f"{BASE}/skills")
e2e_skills = [
    s for s in skills
    if "E2E" in s.get("name", "")
    or "e2e" in s.get("name", "").lower()
    or "E2E tests" in str(s.get("description", ""))
    or "E2E tests" in str(s.get("author", ""))
]
print(f"Skills: {len(e2e_skills)} E2E to delete (of {len(skills)} total)")
for s in e2e_skills:
    delete(f'{BASE}/skills/{s["id"]}')
print(f"  Deleted {len(e2e_skills)} skills")

# --- Gallery ---
gallery = fetch(f"{BASE}/gallery")
e2e_gallery = [
    g for g in gallery
    if "E2E" in g.get("title", "")
    or "e2e" in g.get("title", "").lower()
    or "Lifecycle" in g.get("title", "")
    or "Test description" in g.get("description", "")
]
print(f"Gallery: {len(e2e_gallery)} E2E to delete (of {len(gallery)} total)")
for g in e2e_gallery:
    delete(f'{BASE}/gallery?id={g["id"]}')
print(f"  Deleted {len(e2e_gallery)} gallery items")

# --- Summary ---
print()
remaining_t = len(fetch(f"{BASE}/templates"))
remaining_p = len(fetch(f"{BASE}/pipelines").get("pipelines", []))
remaining_s = len(fetch(f"{BASE}/skills"))
remaining_g = len(fetch(f"{BASE}/gallery"))
print(f"Remaining: {remaining_t} templates, {remaining_p} pipelines, {remaining_s} skills, {remaining_g} gallery items")
