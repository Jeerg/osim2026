"""PAWLICEK-Zufallsgenerator und Verteilungs-Kernfunktionen.

Provenienz (alle wörtlich aus OSim2004):
    - `inc/OVerteil.h`: Klassen-Header + Konstante `STD_KEIM`
    - `OFC/OVerteil.cpp`: Konstruktor, `Zufall()`, `VertGleich()`,
      `VertNormCalc()`, `VertNorm()` (Jeerg-Rejection), `VertExpo()`,
      `VertLogNorm()`

Bit-Reproduzierbarkeits-Vertrag:
    - `fmod` via `math.fmod` (nicht Python-`%`, das verhält sich bei
      negativen Operanden anders)
    - Float-Konstanten exakt wie in C++ (`AM = 4294967296.0`, `AA = 6636085.0`,
      `X = 907633385.0`, `STD_KEIM = 1776496601.0`)
    - Operatoren-Reihenfolge in `VertNormCalc` exakt: erst `*= sqrt(2.0)`,
      dann `*= (wert*wert/120.0 + 0.975) * sa`

Modul-Singleton `s_verteil` entspricht C++ `OSimulator::s_verteil`
(siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 6.3).
"""

from __future__ import annotations

import math


STD_KEIM: float = 1776496601.0

_AM: float = 4294967296.0  # 2^32
_AA: float = 6636085.0
_X: float = 907633385.0


class OVerteil:
    """Klassen-1:1-Portierung von `OVerteil` aus `OFC/OVerteil.cpp`.

    Kapselt den LCG-Keim-State und die vier Verteilungs-Kernfunktionen.
    `_keim_intern` ist der interne Keim, `_keim` ist die aktive Referenz
    (im C++-Original ein Pointer auf entweder `keim_intern` oder einen
    externen Keim — in Python lösen wir das über zwei Felder + Flag).
    """

    def __init__(self, seed: float = STD_KEIM) -> None:
        self._keim_intern: float = seed
        self._external_ref: list[float] | None = None  # None → intern
        self._anti: int = 0

    # ------------------------------------------------------------------
    # Keim-Verwaltung — OFC/OVerteil.cpp:88-132
    # ------------------------------------------------------------------

    def interner_keim(self, keim_neu: float = -1.0) -> float:
        """Schaltet auf internen Keim, gibt alten Wert zurück.

        Bei `keim_neu >= 0.0` wird der interne Keim auf den neuen Wert
        gesetzt. Wörtlich aus `OVerteil::InternerKeim`.
        """
        keim_alt = self._keim_intern
        self._external_ref = None
        if keim_neu >= 0.0:
            self._keim_intern = keim_neu
        return keim_alt

    def externer_keim(self, keim_extern: list[float] | None = None) -> None:
        """Schaltet auf externen Keim (Mutable-Ref) oder zurück auf intern.

        Im C++-Original ein `double *`; in Python als `list[float]` mit
        einem Element (mutable Container).
        """
        self._external_ref = keim_extern

    def naechster_keim(self, n: int = 1) -> None:
        for _ in range(n):
            self.zufall()

    def antithetisch(self, anti_neu: int | None = None) -> int:
        """Read (anti_neu=None) or write the antithetisch-Flag.

        Doppel-Methode in C++ (mit/ohne Parameter). In Python via
        Optional-Default zusammengefasst.
        """
        anti_alt = self._anti
        if anti_neu is not None:
            self._anti = anti_neu
        return anti_alt

    # ------------------------------------------------------------------
    # LCG-Kern — OFC/OVerteil.cpp:60-71
    # ------------------------------------------------------------------

    @property
    def keim(self) -> float:
        """Aktuelle Keim-Referenz (intern oder extern)."""
        if self._external_ref is None:
            return self._keim_intern
        return self._external_ref[0]

    @keim.setter
    def keim(self, value: float) -> None:
        if self._external_ref is None:
            self._keim_intern = value
        else:
            self._external_ref[0] = value

    def zufall(self) -> float:
        """PAWLICEK-Schritt + Normierung auf [0, 1].

        Bit-genau wie `OFC/OVerteil.cpp::Zufall()`:
            keim = fmod(AA * keim + X, AM)
            wert = keim / AM
            return (1.0 - wert) if anti else wert
        """
        self.keim = math.fmod(_AA * self.keim + _X, _AM)
        wert = self.keim / _AM
        if self._anti:
            return 1.0 - wert
        return wert

    # ------------------------------------------------------------------
    # Verteilungs-Funktionen — OFC/OVerteil.cpp:182-377
    # ------------------------------------------------------------------

    def vert_gleich(self) -> float:
        """Gleichverteilung in [0, 1). OFC/OVerteil.cpp:182-185."""
        return self.zufall()

    def vert_gleich_range(self, min_val: float, max_val: float) -> float:
        """Gleichverteilung in [min, max], clamped. OFC/OVerteil.cpp:202-216."""
        if max_val < min_val:
            min_val, max_val = max_val, min_val
        wert = self.vert_gleich() * (max_val - min_val) + min_val
        if wert < min_val:
            return min_val
        if wert > max_val:
            return max_val
        return wert

    def vert_norm_calc(self, ew: float = 0.0, sa: float = 1.0) -> float:
        """Box-Müller-Polynom-Approximation. OFC/OVerteil.cpp:254-262.

        **Kritisch**: Operatoren-Reihenfolge erst `*= sqrt(2.0)`, dann
        `*= (wert*wert/120.0 + 0.975) * sa`. NICHT umstellen.
        """
        wert = -3.0
        for _ in range(6):
            wert += self.vert_gleich()
        wert *= math.sqrt(2.0)
        wert *= (wert * wert / 120.0 + 0.975) * sa
        return wert if ew == 0.0 else (ew + ew * wert)

    def vert_norm(self, ew: float = 0.0, sa: float = 1.0) -> float:
        """Normalverteilung mit Jeerg-Rejection. OFC/OVerteil.cpp:234-252.

        Rejection-Kriterium: `if ew * -1 < wert: break` (äquivalent zu
        `wert > -ew`). Bei Default `ew=0.0` bedeutet das: nur positive
        Werte werden akzeptiert (Halb-Normalverteilung — siehe DIFFTEST.md).
        """
        wert = 0.0
        n = 0
        while n < 10000:
            wert = self.vert_norm_calc(0.0, sa)
            n += 1
            if ew * -1 < wert:
                break
        if n >= 10000:
            wert = ew
        return ew + wert

    def vert_norm_grenz(self, ew: float, sa: float, min_val: float, max_val: float) -> float:
        """Abgeschnittene Normal in [min, max]. OFC/OVerteil.cpp:306-318.

        Bei 10000 fehlgeschlagenen Versuchen wird `ew` zurückgegeben.
        """
        wert = 0.0
        n = 0
        # do-while: erst einmal ziehen, dann Bedingung prüfen
        while True:
            wert = self.vert_norm(ew, sa)
            n += 1
            if not ((wert < min_val) or (wert > max_val)) or n >= 10000:
                break
        if n >= 10000:
            return ew
        return wert

    def vert_expo(self, ew: float, rv: float = 0.0) -> float:
        """Rechtsverschobene Exponentialverteilung. OFC/OVerteil.cpp:335-341.

        **Kritisch**: nutzt `self.zufall()` direkt (nicht `vert_gleich()`),
        wie das C++-Original. Bei `_anti=1` ergibt das andere Werte als
        `vert_gleich()` — aber das ist OSim-treues Verhalten.
        """
        wert = 0.0
        while wert <= 0.0:
            wert = self.zufall()
        return rv - math.log(wert) * (ew - rv)

    def vert_log_norm(self, ew: float, sa: float) -> float:
        """Log-Normalverteilung. OFC/OVerteil.cpp:368-377.

        Bei `ew <= 0`: liefert 0.0.
        Ansonsten Standard-Formel mit `vert_norm(0.0, 1.0)` als
        N(0,1)-Komponente.
        """
        if ew <= 0.0:
            return 0.0
        sigma = math.sqrt(math.log(sa * sa + 1.0))
        lambda_ = math.log(ew) - sigma * sigma / 2
        return math.exp(lambda_ + sigma * self.vert_norm(0.0, 1.0))


# ----------------------------------------------------------------------
# Modul-Singleton — entspricht C++ `OSimulator::s_verteil`
# ----------------------------------------------------------------------

s_verteil: OVerteil = OVerteil(STD_KEIM)


def reset_keim(neuer_keim: float = STD_KEIM) -> None:
    """Setzt den globalen LCG-Keim zurück.

    Wird aufgerufen aus `Simulator.reset()` (Phase 1) und in pytest-Fixtures
    zur Test-Isolation (siehe `tests/conftest.py`).
    """
    s_verteil._keim_intern = neuer_keim
    s_verteil._external_ref = None
    s_verteil._anti = 0
