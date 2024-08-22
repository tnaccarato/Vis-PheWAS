from django.urls import path

from .views import SOMView

urlpatterns = [
    path('SOM/', SOMView.as_view(), name='SOM'),
]
