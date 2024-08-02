from django.shortcuts import render


def index(request):
    """
    View function to render the index page
    :param request:
    :return:
    """
    return render(request, 'mainapp/index.html')