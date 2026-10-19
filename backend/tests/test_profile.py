from app.routes import profile as profile_routes
from conftest import USER_ID


def test_dashboard_uses_per_user_database_counts(test_context):
    result = profile_routes.dashboard(user={"id":USER_ID}, db=test_context)
    assert result["syllabi_count"] == 0
    assert result["materials_count"] == 1
    assert len(result["recent_materials"]) == 1


def test_profile_can_be_read_and_updated_by_its_owner(test_context):
    assert profile_routes.get_profile(user={"id":USER_ID}, db=test_context)["full_name"] == "Professora Exemplo"
    from app.routes.profile import ProfileUpdate
    result = profile_routes.update_profile(ProfileUpdate(full_name="Docente Atualizada", school_name="Nova Escola"), user={"id":USER_ID}, db=test_context)
    assert result["school_name"] == "Nova Escola"
