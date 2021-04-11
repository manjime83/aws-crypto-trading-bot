#!/bin/bash

aws cloudformation deploy --template-file template.yaml --stack-name cryptodca --capabilities CAPABILITY_NAMED_IAM --tags user:application=cryptodca --parameter-overrides ApiKey=<APIKEY> ApiSecret=<SECRETKEY> NotificationEmail=<EMAIL> EventInput='{"configUrl":"<URL>"}'
aws lambda update-function-configuration --function-name cryptodca --runtime nodejs14.x

npm install && npm run build
npm ci --only=production && rm -f cryptodca.zip && zip -r cryptodca.zip node_modules/ index.js && rm -f \*.js && npm install

aws lambda update-function-code --function-name cryptodca --zip-file fileb://cryptodca.zip
