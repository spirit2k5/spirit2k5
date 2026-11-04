"""Guard actual search regressions when pages or client previews are added."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "studio_seo_contracts", Path(__file__).resolve().parents[1] / "scripts" / "spirit2k5_seo_check.py"
)
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)


class PrivatePageTests(unittest.TestCase):
    def write_page(self, root, relative, robots="noindex,nofollow"):
        page = root / relative
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(f'<html><head><meta name="robots" content="{robots}"></head></html>', encoding="utf-8")

    def test_new_nested_preview_and_production_template_are_discovered(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_page(root, "previews/new-client/nested/index.html", "NOINDEX, FOLLOW")
            self.write_page(root, "previews/new-client/index.production.html")
            self.write_page(root, "assistant-admin.html")
            seo.validate_private_pages(root, {seo.ORIGIN + "/", seo.ORIGIN + "/services.html"})
            self.write_page(root, "previews/new-client/index.production.html", "index,follow")
            with self.assertRaisesRegex(AssertionError, "index.production.html"):
                seo.validate_private_pages(root, set())

    def test_missing_noindex_on_new_preview_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_page(root, "previews/another-client/index.html", "index,follow")
            with self.assertRaisesRegex(AssertionError, "Private page indexable"):
                seo.validate_private_pages(root, set())

    def test_noindex_must_be_a_directive_not_a_substring(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_page(root, "assistant-admin.html", "not-noindex,follow")
            with self.assertRaisesRegex(AssertionError, "assistant-admin.html"):
                seo.validate_private_pages(root, set())

    def test_preview_directory_alias_and_file_cannot_enter_sitemap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_page(root, "previews/new-client/index.html")
            for relative in ("previews/new-client/", "previews/new-client/index.html", "assistant-admin.html"):
                with self.subTest(relative=relative), self.assertRaisesRegex(AssertionError, "in sitemap"):
                    seo.validate_private_pages(root, {seo.ORIGIN + "/" + relative})


class BusinessIdentityTests(unittest.TestCase):
    def business(self, **changes):
        return {"@type": "ProfessionalService", "@id": seo.BUSINESS_ID,
                "name": seo.BUSINESS_NAME, "url": seo.ORIGIN + "/", **changes}

    def test_valid_graph_reuses_business_for_services_articles_and_founder(self):
        seo.validate_business_entities({"@context": "https://schema.org", "@graph": [
            self.business(),
            {"@type": "WebSite", "@id": seo.WEBSITE_ID, "name": seo.BUSINESS_NAME, "url": seo.ORIGIN + "/"},
            {"@type": "Service", "url": seo.ORIGIN + "/business-website.html", "provider": {"@id": seo.BUSINESS_ID}},
            {"@type": "Article", "url": seo.ORIGIN + "/case-study-denz-iphones.html", "publisher": {"@id": seo.BUSINESS_ID}},
            {"@type": "Person", "name": "Carlton Mahlori Tshianeo", "workFor": {"@id": seo.BUSINESS_ID}},
            {"@type": "Organization", "name": "Denz iPhones", "url": "https://denziphone.com/"},
        ]})

    def test_business_definition_rejects_wrong_or_missing_id(self):
        for identifier in (None, seo.ORIGIN + "/services.html#business"):
            with self.subTest(identifier=identifier), self.assertRaisesRegex(AssertionError, "stable #business ID"):
                seo.validate_business_entities(self.business(**{"@id": identifier}))

    def test_business_cannot_use_a_service_page_as_its_url(self):
        with self.assertRaisesRegex(AssertionError, "business URL must be the homepage"):
            seo.validate_business_entities(self.business(url=seo.ORIGIN + "/services.html"))

    def test_nested_service_provider_and_article_publisher_reject_wrong_reference(self):
        for kind, relation in (("Service", "provider"), ("Article", "publisher")):
            with self.subTest(kind=kind), self.assertRaisesRegex(AssertionError, "stable #business ID"):
                seo.validate_business_entities({"@graph": [{"@type": kind, "url": seo.ORIGIN + "/example.html",
                                                           relation: {"@id": seo.ORIGIN + "/#another-business"}}]})

    def test_client_organizations_and_external_services_keep_their_own_identity(self):
        seo.validate_business_entities([
            {"@type": ["Organization", "LocalBusiness"], "name": "RONMAXAKS", "url": "https://ronmaxaks.com/"},
            {"@type": "Service", "url": "https://ronmaxaks.com/security", "provider": {"@id": "https://ronmaxaks.com/#business"}},
        ])

    def test_studio_website_rejects_wrong_identity(self):
        with self.assertRaisesRegex(AssertionError, "stable #website ID"):
            seo.validate_business_entities({"@type": "WebSite", "name": seo.BUSINESS_NAME,
                                            "@id": seo.ORIGIN + "/services.html#website", "url": seo.ORIGIN + "/"})


if __name__ == "__main__":
    unittest.main()
