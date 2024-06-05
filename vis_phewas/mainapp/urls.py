from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('get_data/<str:level>/', views.mind_map_data, name='get_data_level'),
    path('get_data/<str:level>/<str:identifier>/', views.mind_map_data, name='get_data_identifier'),
]
