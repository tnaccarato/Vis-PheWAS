# urls.py
from django.urls import path
from .views import IndexView, GraphDataView, InfoView, ExportDataView, CombinedAssociationsView, GetNodePathView, \
    GetDiseasesForCategoryView, SendDataToSOMView

urlpatterns = [
    path('', IndexView.as_view(), name='index'),
    path('graph-data/', GraphDataView.as_view(), name='graph_data'),
    path('get-info/', InfoView.as_view(), name='info'),
    path('export-query/', ExportDataView.as_view(), name='export_data'),
    path('get_combined_associations/', CombinedAssociationsView.as_view(), name='combined_associations'),
    path('get-path-to-node/', GetNodePathView.as_view(), name='get_path_to_node'),
    path('get-diseases/', GetDiseasesForCategoryView.as_view(), name='get_diseases_for_category'),
    path('send_data_to_som/', SendDataToSOMView.as_view(), name='send_data_to_som'),
]
