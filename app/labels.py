"""
Attaches "how long until this stand's next failure" and "how long since its
last one" to every row, and splits data into train/test by day rather than
randomly.

Why a time-based split and not a random one: this is a monitoring
problem, not a generic classification problem. In production you'd
train on history and evaluate on what comes after. A random shuffle
would let the model implicitly peek at data from the same failure
event it's being tested against. Did it the "quick" random way first,
got suspiciously good numbers, and that was the tell something was
wrong. See docs/ai-partnership-log.md.

Why "since last failure" too, not just "until next failure": the generator
holds a stand at its fully-failed values for the rest of the day once it
fails (see data/generate_synthetic_data.py), so the hour right after a
failure is still visibly broken. A row only far enough from the NEXT
failure isn't automatically "normal" if it's actually the immediate
aftermath of the PREVIOUS one. Originally this only checked the forward
direction, which meant "normal" baseline stats and false-positive-rate
evaluation could both quietly include still-broken recovery minutes as if
they were clean baseline. Caught this via app/detector.py's backstop alert:
it correctly flagged genuinely-abnormal post-failure rows that the
one-directional "normal" filter had been letting through uncounted. See
docs/ai-partnership-log.md for the full story.
"""

import pandas as pd

NORMAL_THRESHOLD_MIN = 24 * 60  # rows more than this far from a failure (either direction) count as "normal"
TRAIN_DAY_FRACTION = 0.8


def attach_time_to_failure(features: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    events = events.copy()
    events["failure_timestamp"] = pd.to_datetime(events["failure_timestamp"])
    features = features.copy()
    features["timestamp"] = pd.to_datetime(features["timestamp"])

    out = []
    for stand_id, group in features.groupby("stand_id"):
        stand_events = events.loc[events.stand_id == stand_id, "failure_timestamp"].sort_values()
        group = group.sort_values("timestamp").reset_index(drop=True)
        if stand_events.empty:
            group = group.assign(
                time_to_failure_min=pd.NA, failure_timestamp=pd.NaT, time_since_failure_min=pd.NA,
            )
        else:
            merged = pd.merge_asof(
                group, stand_events.to_frame(), left_on="timestamp",
                right_on="failure_timestamp", direction="forward",
            )
            merged["time_to_failure_min"] = (
                (merged["failure_timestamp"] - merged["timestamp"]).dt.total_seconds() / 60
            )

            prev = pd.merge_asof(
                group[["timestamp"]],
                stand_events.to_frame().rename(columns={"failure_timestamp": "prev_failure_timestamp"}),
                left_on="timestamp", right_on="prev_failure_timestamp", direction="backward",
            )
            merged["time_since_failure_min"] = (
                (merged["timestamp"] - prev["prev_failure_timestamp"]).dt.total_seconds() / 60
            )
            group = merged
        out.append(group)

    return pd.concat(out, ignore_index=True)


def is_clean_normal(labeled: pd.DataFrame) -> pd.Series:
    """True for rows that are far from a failure in BOTH directions: not
    approaching one, and not still recovering from one."""
    far_from_next = labeled["time_to_failure_min"].isna() | (labeled["time_to_failure_min"] > NORMAL_THRESHOLD_MIN)
    far_from_last = labeled["time_since_failure_min"].isna() | (labeled["time_since_failure_min"] > NORMAL_THRESHOLD_MIN)
    return far_from_next & far_from_last


def split_train_test(labeled: pd.DataFrame):
    """Time-based split: earliest N% of each stand's days for training, rest held out."""
    labeled = labeled.copy()
    labeled["day"] = labeled["timestamp"].dt.normalize()

    train_frames, test_frames = [], []
    for _stand_id, group in labeled.groupby("stand_id"):
        days = sorted(group["day"].unique())
        cutoff = days[int(len(days) * TRAIN_DAY_FRACTION)]
        train_frames.append(group[group["day"] < cutoff])
        test_frames.append(group[group["day"] >= cutoff])

    train = pd.concat(train_frames, ignore_index=True)
    test = pd.concat(test_frames, ignore_index=True)

    train_normal = train[is_clean_normal(train)]
    return train_normal, test
