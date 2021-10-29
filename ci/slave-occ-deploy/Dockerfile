FROM docker.mot-solutions.com/msi/digital/slave-chrome-node-10

USER root

RUN apt-get update && \
    curl -sL https://deb.nodesource.com/setup_13.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y build-essential && \
    apt-get install unzip && \
    apt-get install nano

COPY /../../../occ-tools /opt/occ-tools
COPY /files/ /tmp

RUN chown jenkins:jenkins /tmp/config.json

RUN cd /opt/occ-tools && \
    npm install --unsafe-perm && \
    echo "alias occ-tools='node /opt/occ-tools/index'" >> /etc/bash.bashrc && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.36.0/install.sh | bash

USER jenkins

RUN mkdir /home/jenkins/occ-tools-cli && \
    mkdir /home/jenkins/occ-tools-cli/database && \
    mv /tmp/config.json /home/jenkins/occ-tools-cli/config.json
