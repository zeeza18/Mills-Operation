import type { FleetEntry } from "../types";
import { StandCard } from "./StandCard";

interface Props {
  fleet: FleetEntry[];
  selected: string | null;
  onSelect: (standId: string) => void;
}

export function FleetStrip({ fleet, selected, onSelect }: Props) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="fleet-strip"
    >
      {fleet.map((stand, i) => (
        <StandCard
          key={stand.standId}
          stand={stand}
          index={i}
          isSelected={stand.standId === selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
