# Use an official Python runtime as a parent image
FROM python:3.7.0-stretch

# Set the working directory to /app
WORKDIR /opt/elltwo

# Copy the current directory contents into the container at /app
ADD . /opt/elltwo

# Install any needed packages specified in requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80

# Run app.py when the container launches
CMD ["python", "-u", "server.py", "--demo", "--path=/data", "--ip=0.0.0.0", "--port=80", "--macros=macros.txt"]
