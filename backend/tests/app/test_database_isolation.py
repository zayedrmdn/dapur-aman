import os

import app.config
import app.database


def test_tests_use_in_memory_sqlite_not_the_configured_database():
    assert os.environ["DATABASE_URL"] == "sqlite://"
    assert app.config.DATABASE_URL == "sqlite://"
    assert app.database.engine.url.get_backend_name() == "sqlite"
    assert app.database.engine.url.database in (None, "", ":memory:")


def test_unpooled_database_url_is_blank_during_tests():
    assert not app.config.DATABASE_URL_UNPOOLED
