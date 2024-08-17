from rest_framework import serializers

from .models import HlaPheWasCatalog


class HlaPheWasCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = HlaPheWasCatalog
        fields = '__all__'
