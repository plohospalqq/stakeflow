"""Scenario parsing on the real marts (model still scripted). Skips without the database."""

import pytest

from stakeflow_api.scenarios.data import MartsScenarioData
from stakeflow_api.scenarios.parser import ScenarioParseRequest, parse_scenario
from tests.fakes import FakeAnthropic, tool_call
from tests.test_scenarios import EXAMPLE, driver, outage, submission

# Written independently of scenarios/data.py: Sverdrup's share of Aker BP's net production over
# the 12 latest months with data
REFERENCE_SHARE_SQL = """
with period as (
    select latest_month - interval '11 months' as first_month, latest_month as last_month
    from marts.meta_data_freshness
)
select 100 * sum(cf.oe_sm3) filter (where f.name = 'JOHAN SVERDRUP') / sum(cf.oe_sm3)
from marts.fct_company_field_production_monthly as cf
join marts.dim_field as f using (field_id)
cross join period
where cf.group_id = 'aker-bp' and cf.month between period.first_month and period.last_month
"""


@pytest.fixture
def data(owner_conn):
    return MartsScenarioData(owner_conn)


def sverdrup_id(data) -> int:
    return next(m.field_id for m in data.find_fields("sverdrup") if m.name == "JOHAN SVERDRUP")


def test_lookup_finds_the_field_and_its_current_owners(data):
    match = next(m for m in data.find_fields("Sverdrup") if m.name == "JOHAN SVERDRUP")
    assert match.status == "Producing"
    assert sum(share for _, _, share in match.owners) == pytest.approx(100, abs=0.01)
    assert {"equinor", "aker-bp"} <= {group for group, _, _ in match.owners}


def test_field_share_matches_an_independent_calculation(data, owner_conn):
    [expected] = owner_conn.execute(REFERENCE_SHARE_SQL).fetchone()
    shares = {s.group_id: s for s in data.field_shares(sverdrup_id(data))}
    aker = shares["aker-bp"]
    assert aker.share_pct == pytest.approx(float(expected), rel=1e-9)
    assert all(0 < s.share_pct <= 100 for s in shares.values())

    [latest] = owner_conn.execute("select latest_month from marts.meta_data_freshness").fetchone()
    start, end = aker.period_start, aker.period_end
    assert end == latest
    assert (end.year - start.year) * 12 + end.month - start.month + 1 == 12  # a 12-month window


def test_companies_include_the_focus_companies(data):
    companies = data.companies()
    assert companies["equinor"] == "Equinor (NCS only)"
    assert {"aker-bp", "var-energi"} <= companies.keys()


def test_example_case_on_real_data(data, owner_conn):
    field_id = sverdrup_id(data)
    change = outage()
    change["field_changes"][0]["field_id"] = field_id
    client = FakeAnthropic(
        tool_call("lookup_field", {"name": "Johan Sverdrup"}),
        tool_call(
            "submit_scenario",
            submission(brent=driver("target_level", 90, "oil goes to $90"), production=change),
        ),
    )
    result = parse_scenario(
        ScenarioParseRequest(text=EXAMPLE, company_id="aker-bp", reference={"brent_usd": 65}),
        client=client,
        data=data,
    )
    [share] = owner_conn.execute(REFERENCE_SHARE_SQL).fetchone()
    assert result.production_change_pct == pytest.approx(-float(share) * 2 / 3, abs=0.05)
    assert result.brent_change_pct == 38.5
    assert any("of Aker BP's net production" in a for a in result.assumptions)
