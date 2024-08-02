# urls.py
from django.urls import path
from .views import IndexView, GraphDataView, InfoView, ExportDataView, CombinedAssociationsView

urlpatterns = [
    path('', IndexView.as_view(), name='index'),
    path('graph-data/', GraphDataView.as_view(), name='graph_data'),
    path('get-info/', InfoView.as_view(), name='info'),
    path('export-query/', ExportDataView.as_view(), name='export_data'),
    path('get_combined_associations/', CombinedAssociationsView.as_view(), name='combined_associations'),
]
