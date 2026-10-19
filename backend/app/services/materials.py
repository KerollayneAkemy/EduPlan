def include_syllabus_details(rows: list[dict], user_id: str, db) -> list[dict]:
    syllabus_ids = list({row["syllabus_id"] for row in rows if row.get("syllabus_id")})
    syllabi = []
    if syllabus_ids:
        syllabi = db.table("syllabi").select("id,subject,school_year,academic_year,semester,file_name").eq("user_id", user_id).in_("id", syllabus_ids).execute().data
    by_id = {row["id"]: row for row in syllabi}
    return [{**row, "syllabus": by_id.get(row.get("syllabus_id"))} for row in rows]
