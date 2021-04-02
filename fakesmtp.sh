#!/bin/bash
mkdir -p dev/fake-smtp
cd dev/fake-smtp
if [ ! -f *.jar ]; then
  wget -O smtp.zip http://nilhcem.github.com/FakeSMTP/downloads/fakeSMTP-latest.zip
  unzip smtp.zip
fi

java -jar *.jar -p 2525 -s
