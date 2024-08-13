from django.urls import path
from . import views
from .views import SOMView

urlpatterns = [
    path('SOM/', SOMView.as_view(), name='SOM'),
    path('som_button/', views.som_button, name='som_button'),
    ]