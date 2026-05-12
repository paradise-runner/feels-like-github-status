#!/usr/bin/env python3
"""
Merge freshly extracted incidents with existing committed data.

The upstream extractor reconstructs incidents by traversing git history
of the atom feed. Since we vendored only a single atom snapshot, it can
only produce ~90 days of data at a time. This script merges new incidents
into the existing historical dataset and regenerates the CSV files.

Usage:
    python pipeline/merge_incidents.py \
        --existing parsed/incidents.jsonl \
        --incoming <tmp_dir>/incidents.jsonl \
        --out parsed
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone


def load_incidents(path):
    incidents = {}
    if not os.path.exists(path):
        return incidents
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            incidents[str(obj["id"])] = obj
    return incidents


def save_incidents(incidents, path):
    ordered = sorted(incidents.values(), key=lambda i: i.get("published_at") or "")
    with open(path, "w", encoding="utf-8") as f:
        for incident in ordered:
            f.write(json.dumps(incident, ensure_ascii=True))
            f.write("\n")
    print(f"Wrote {len(ordered)} incidents to {path}")


def merge(existing, incoming):
    for inc_id, incident in incoming.items():
        existing_inc = existing.get(inc_id)
        if existing_inc is None:
            existing[inc_id] = incident
            continue

        # Merge updates — deduplicate by (at, status, message)
        existing_updates = existing_inc.get("updates") or []
        incoming_updates = incident.get("updates") or []

        existing_keys = {(u["at"], u["status"], u["message"]) for u in existing_updates}
        merged_updates = list(existing_updates)

        for update in incoming_updates:
            key = (update["at"], update["status"], update["message"])
            if key not in existing_keys:
                merged_updates.append(update)
                existing_keys.add(key)

        STATUS_ORDER = {
            "Investigating": 0, "Identified": 1, "Monitoring": 2,
            "Update": 3, "Resolved": 4, "Scheduled": 0,
            "In progress": 2, "Completed": 4,
        }
        merged_updates.sort(
            key=lambda u: (u["at"], STATUS_ORDER.get(u["status"], 99), u["message"])
        )

        incident["updates"] = merged_updates

        # Merge scalar fields — prefer incoming
        for field in ["title", "url", "impact", "impact_window",
                       "status_sequence", "components_source", "components_confidence"]:
            if field in incident and incident[field] is not None:
                existing_inc[field] = incident[field]

        # Merge time bounds — prefer earliest start, latest end
        if incident.get("started_at") and (
            not existing_inc.get("started_at") or
            incident["started_at"] < existing_inc["started_at"]
        ):
            existing_inc["started_at"] = incident["started_at"]
        if incident.get("resolved_at") and (
            not existing_inc.get("resolved_at") or
            incident["resolved_at"] > existing_inc["resolved_at"]
        ):
            existing_inc["resolved_at"] = incident["resolved_at"]

        # Merge components (dedup, preserve order)
        existing_comps = existing_inc.get("components") or []
        incoming_comps = incident.get("components") or []
        if incoming_comps:
            merged_comps = list(dict.fromkeys(existing_comps + incoming_comps))
            existing_inc["components"] = merged_comps

        existing[inc_id] = existing_inc

    # Recompute downtime fields for all merged incidents
    for inc_id, incident in existing.items():
        recompute_downtime(incident)

    return existing


def recompute_downtime(incident):
    updates = incident.get("updates") or []
    if not updates:
        return

    # Find impact_window from postmortem messages
    has_impact = incident.get("impact_window")
    if has_impact:
        downtime_start = has_impact["start_at"]
        downtime_end = has_impact["end_at"]
        source = "postmortem"
    else:
        started_at = None
        resolved_at = None
        for u in updates:
            if u["status"] == "Investigating" and started_at is None:
                started_at = u["at"]
            if u["status"] == "Resolved":
                resolved_at = u["at"]
        if not started_at and updates:
            started_at = updates[0]["at"]
        if not resolved_at and updates:
            resolved_at = updates[-1]["at"]
        downtime_start = started_at
        downtime_end = resolved_at
        source = "updates"

    incident["downtime_start"] = downtime_start
    incident["downtime_end"] = downtime_end

    if downtime_start and downtime_end:
        start_dt = datetime.fromisoformat(downtime_start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(downtime_end.replace("Z", "+00:00"))
        incident["duration_minutes"] = int((end_dt - start_dt).total_seconds() // 60)
    else:
        incident["duration_minutes"] = None

    incident["downtime_source"] = source


def write_downtime_windows(incidents, path):
    fieldnames = [
        "incident_id", "downtime_start", "downtime_end",
        "duration_minutes", "source", "title", "impact",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        count = 0
        for incident in sorted(incidents.values(), key=lambda i: i.get("published_at") or ""):
            if not incident.get("downtime_start") or not incident.get("downtime_end"):
                continue
            source = "postmortem" if incident.get("impact_window") else "updates"
            writer.writerow({
                "incident_id": incident["id"],
                "downtime_start": incident["downtime_start"],
                "downtime_end": incident["downtime_end"],
                "duration_minutes": incident["duration_minutes"],
                "source": source,
                "title": incident["title"],
                "impact": incident.get("impact"),
            })
            count += 1
    print(f"Wrote {count} rows to {path}")


def write_segments(incidents, path):
    fieldnames = ["incident_id", "start_at", "end_at", "status"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        count = 0
        for incident in sorted(incidents.values(), key=lambda i: i.get("published_at") or ""):
            updates = incident.get("updates") or []
            for idx, update in enumerate(updates):
                if idx + 1 >= len(updates):
                    break
                writer.writerow({
                    "incident_id": incident["id"],
                    "start_at": update["at"],
                    "end_at": updates[idx + 1]["at"],
                    "status": update["status"],
                })
                count += 1
    print(f"Wrote {count} rows to {path}")


def main():
    parser = argparse.ArgumentParser(
        description="Merge incoming incidents into existing data and regenerate CSVs."
    )
    parser.add_argument("--existing", required=True, help="Path to existing incidents.jsonl")
    parser.add_argument("--incoming", required=True, help="Path to incoming incidents.jsonl")
    parser.add_argument("--out", required=True, help="Output directory for all files")
    args = parser.parse_args()

    existing = load_incidents(args.existing)
    incoming = load_incidents(args.incoming)

    print(f"Existing incidents: {len(existing)}")
    print(f"Incoming incidents: {len(incoming)}")

    merged = merge(existing, incoming)
    print(f"Merged incidents:  {len(merged)}")

    incidents_path = os.path.join(args.out, "incidents.jsonl")
    save_incidents(merged, incidents_path)

    windows_path = os.path.join(args.out, "downtime_windows.csv")
    write_downtime_windows(merged, windows_path)

    segments_path = os.path.join(args.out, "segments.csv")
    write_segments(merged, segments_path)


if __name__ == "__main__":
    main()
