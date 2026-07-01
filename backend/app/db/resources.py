from app.db.models import Resource


def upsert_resource(
    db,
    integration_id,
    provider,
    resource_type,
    external_id,
    name,
    metadata_json,
):
    resource = (
        db.query(Resource)
        .filter(
            Resource.provider == provider,
            Resource.external_id == str(external_id),
        )
        .first()
    )

    if resource is None:
        resource = Resource(
            integration_id=integration_id,
            provider=provider,
            resource_type=resource_type,
            external_id=str(external_id),
            name=name,
            display_name=name,
            metadata_json=metadata_json,
        )

        db.add(resource)

    else:
        resource.metadata_json = metadata_json
        resource.name = name
        resource.display_name = name

    db.commit()

    return resource
