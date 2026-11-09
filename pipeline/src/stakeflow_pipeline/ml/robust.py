"""Small robust statistics helpers shared by the ML code."""

import numpy as np
from numpy.typing import NDArray

Vector = NDArray[np.float64]

# MAD x 1.4826 estimates the standard deviation of normally distributed data
MAD_TO_SIGMA = 1.4826


def theil_sen(x: Vector, y: Vector) -> tuple[float, float]:
    """Slope and intercept of the Theil-Sen line: median of all pairwise slopes.

    Up to ~29% of points can be outliers (an outage, a turnaround) without moving the line,
    which an ordinary least-squares trend cannot promise.
    """
    i, j = np.triu_indices(len(x), k=1)
    dx = x[j] - x[i]
    keep = dx != 0
    slope = float(np.median((y[j] - y[i])[keep] / dx[keep])) if keep.any() else 0.0
    intercept = float(np.median(y - slope * x))
    return slope, intercept


def robust_sigma(residuals: Vector) -> float:
    return MAD_TO_SIGMA * float(np.median(np.abs(residuals - np.median(residuals))))
