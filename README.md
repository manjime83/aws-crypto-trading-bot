```bash
aws cloudformation deploy --template-file template.yaml --stack-name trading-bot \
 --capabilities CAPABILITY_NAMED_IAM --tags user:application=trading-bot --parameter-overrides \
 BinanceKey=<KEY> \
 BinanceSecret=<SECRET> \
 TradingBotConfig=BTC,USDT,25 \
 NotificationFromEmail=<EMAIL> NotificationToEmail=<EMAIL>
```

```bash
cd lambda
rm ../trading-bot.zip
npm install
npm run build && rm test.js
npm ci --only=production
zip -r ../trading-bot.zip . -x \*.env \*.ts tsconfig.json
aws lambda update-function-code --function-name trading-bot --zip-file fileb://../trading-bot.zip
npm install
cd ..
```
