from django.shortcuts import render

from .models import HlaPheWasCatalog


def index(request):
    """
    View function for home page of site.
    """
    # Generate counts of some of the main objects
    num_entries = HlaPheWasCatalog.objects.all().count()

    context = {
        'num_entries': num_entries,
    }

    # Render the HTML template index.html with the data in the context variable
    return render(request, 'mainapp/index.html', context)
