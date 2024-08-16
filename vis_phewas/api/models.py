from django.db import models


class TemporaryCSVData(models.Model):
    csv_content = models.TextField()  # Store the CSV content as text
    som_type = models.CharField(max_length=100)  # Store the SOM type, e.g., 'disease' or 'allele'
    created_at = models.DateTimeField(
        auto_now_add=True)  # Automatically set the field to now when the object is first created

    def __str__(self):
        return f"Temporary CSV Data (ID: {self.id})"
