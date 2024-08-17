from django.shortcuts import render


def index(request):
    """
    View function to render the index page
    :param request: HttpRequest object
    :return: HttpResponse object with the rendered index page
    """
    return render(request, 'mainapp/index.html')
