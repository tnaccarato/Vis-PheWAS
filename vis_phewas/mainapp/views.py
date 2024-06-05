from django.shortcuts import render
from django.http import JsonResponse
from .models import HlaPheWasCatalog


def index(request):
    """
    View function for the home page of the site.
    """
    num_entries = HlaPheWasCatalog.objects.count()  # Count of all entries
    context = {
        'num_entries': num_entries,
    }
    return render(request, 'mainapp/index.html', context)


def mind_map_data(request, level, identifier=None):
    """
    Respond to data requests at different levels of the mind map.
    'level' specifies the data depth: category, disease, or allele.
    'identifier' specifies the specific category or disease to fetch deeper data.
    """
    if level == 'category':
        # Return all categories
        categories = HlaPheWasCatalog.objects.values('category_string').distinct()
        data = [{"name": cat['category_string'], "id": cat['category_string'], "level": "disease"} for cat in
                categories]

    elif level == 'disease' and identifier:
        # Return all diseases for a given category
        diseases = HlaPheWasCatalog.objects.filter(category_string=identifier).values('phewas_string').distinct()
        data = [{"name": dis['phewas_string'], "id": dis['phewas_string'], "level": "allele"} for dis in diseases]

    elif level == 'allele' and identifier:
        # Return top 5 alleles for a given disease
        alleles = HlaPheWasCatalog.objects.filter(phewas_string=identifier).order_by('-odds_ratio')[:5]
        data = [{"name": allele.snp, "value": allele.odds_ratio} for allele in alleles]

    else:
        data = []

    return JsonResponse(data, safe=False)  # safe=False is necessary to allow top-level arrays to be serialized

