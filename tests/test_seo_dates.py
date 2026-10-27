"""Keep lastmod validation aligned with Spirit2k5's South African dates."""
import importlib.util
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "studio_seo", Path(__file__).resolve().parents[1] / "scripts" / "spirit2k5_seo_check.py"
)
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)


class SiteDateTests(unittest.TestCase):
    def test_site_reaches_next_date_two_hours_before_utc(self):
        self.assertEqual(seo.site_today(datetime(2026, 10, 27, 22, 0, tzinfo=timezone.utc)), date(2026, 10, 28))

    def test_before_local_midnight_keeps_previous_date(self):
        self.assertEqual(seo.site_today(datetime(2026, 10, 27, 21, 59, tzinfo=timezone.utc)), date(2026, 10, 27))

    def test_future_local_dates_remain_future(self):
        today = seo.site_today(datetime(2026, 10, 27, 22, 0, tzinfo=timezone.utc))
        self.assertGreater(date(2026, 10, 29), today)


if __name__ == "__main__":
    unittest.main()
