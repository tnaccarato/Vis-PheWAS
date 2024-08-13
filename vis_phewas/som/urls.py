from django.urls import path
from . import views
from .views import SOMDiseaseView, SOMSNPView

urlpatterns = [
    path('SOMSNP/', SOMSNPView.as_view(), name='SOM'),
    path('SOMDisease/', SOMDiseaseView.as_view(), name='SOM'),
    path('som_button/', views.som_button, name='som_button'),
    ]