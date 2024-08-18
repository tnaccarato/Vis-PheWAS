from django.urls import path

from .views import SOMDiseaseView, SOMSNPView, CircosDiagramView

urlpatterns = [
    path('SOMSNP/', SOMSNPView.as_view(), name='SOM'),
    path('SOMDisease/', SOMDiseaseView.as_view(), name='SOM'),
    path('circos-plot/<str:file_name>', CircosDiagramView.as_view(), name='circos-plot'),
]
