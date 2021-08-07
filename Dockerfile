# Use an official Python runtime as a parent image
FROM python:3.9-alpine

# Set the working directory
WORKDIR /opt/ellone

# Install system packages
RUN apk add --update texlive-full

# Install Python packages
COPY requirements.txt /opt/ellone
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80

# Copy demo documents
COPY macros.txt /opt/ellone
COPY content /opt/ellone/content
RUN mkdir /opt/ellone/temp

# Copy the current directory contents into the container
COPY server.py /opt/ellone
COPY static /opt/ellone/static
COPY templates /opt/ellone/templates

# Run app.py when the container launches
CMD ["python", "-u", "server.py", "--demo=content", "--path=/data", "--ip=0.0.0.0", "--port=80", "--macros=macros.txt", "--debug"]
