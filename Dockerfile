# Use an official Python runtime as a parent image
FROM python:3.7.0-alpine

# Set the working directory
WORKDIR /opt/elltwo

# Install any needed packages specified in requirements.txt
COPY requirements.txt /opt/elltwo
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80

# Copy demo documents
COPY macros.txt /opt/elltwo
COPY content /opt/elltwo/content
RUN mkdir /opt/elltwo/temp

# Copy the current directory contents into the container
COPY server.py /opt/elltwo
COPY static /opt/elltwo/static
COPY templates /opt/elltwo/templates

# Run app.py when the container launches
CMD ["python", "-u", "server.py", "--demo=content", "--path=/data", "--ip=0.0.0.0", "--port=80", "--macros=macros.txt"]
