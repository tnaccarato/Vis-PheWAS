from typing import Any

from mainapp.models import HlaPheWasCatalog


def model_fields(request) -> dict[str, list[Any]]:
    """
    Context processor to get the model fields for the HlaPheWasCatalog model.
    :param request:
    :return: Dictionary containing the model fields
    """
    fields = HlaPheWasCatalog._meta.get_fields()  # Retrieve all field objects from the model
    field_names = [field.name for field in fields]  # Extract the 'name' attribute from each field object
    return {'model_fields': field_names}  # Return a dictionary with the field names
