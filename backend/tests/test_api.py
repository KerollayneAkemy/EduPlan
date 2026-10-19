import pytest
from fastapi import HTTPException

from app.main import health
from app.security import get_user


def test_health_route():
    assert health() == {"status": "ok", "service": "eduplan-api"}


def test_private_dependency_requires_authentication():
    with pytest.raises(HTTPException) as error:
        get_user(None)
    assert error.value.status_code == 401
