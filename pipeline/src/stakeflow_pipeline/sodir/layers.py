"""Sodir DataService layers that Stakeflow ingests.

Ids are from the live FeatureServer catalog (checked 2026-11-08, see docs/phase-1-plan.md).
The `name` doubles as the raw table suffix: raw.sodir_<name>.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Layer:
    id: int
    name: str
    has_geometry: bool = False


LAYERS: tuple[Layer, ...] = (
    Layer(1200, "company"),
    Layer(7100, "field", has_geometry=True),
    Layer(7101, "field_activity_status_hst"),
    Layer(7108, "field_licensee_hst"),
    Layer(7110, "field_operator_hst"),
    Layer(7300, "profiles"),
    Layer(3000, "licence", has_geometry=True),
    Layer(3007, "licence_licensee_hst"),
)

LAYERS_BY_NAME: dict[str, Layer] = {layer.name: layer for layer in LAYERS}
