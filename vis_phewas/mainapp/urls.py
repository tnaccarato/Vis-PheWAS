from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/graph-data/', views.graph_data, name='graph-data'),
    path('api/get-info/', views.get_info, name='get-info'),
    path('api/export-query/', views.export_data, name='export-query'),
]
