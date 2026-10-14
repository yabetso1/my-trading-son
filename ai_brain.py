import os
import requests
import numpy as np
import pandas as pd
import pandas_ta as ta
import yfinance as yf
import xgboost as xgb

WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "https://dash-for-bot.onrender.com/webhook")

# SET YOUR LOT SIZE HERE (100 = 0.01 Lots, 200 = 0.02 Lots, 500 = 0.05 Lots)
TRADE_VOLUME = 200 

def run_pipeline():
    # 1. Fetch 15-Minute Historical Data 
    # (Yahoo Finance limits intraday data to 60 days max)
    print("Fetching historical 15m Gold data...")
    df = yf.download("GC=F", interval="15m", period="60d", auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    df = df.astype(float)

    # 2. Feature Engineering
    df['RSI'] = ta.rsi(df['Close'], length=14)
    df['EMA_20'] = ta.ema(df['Close'], length=20)
    df['EMA_50'] = ta.ema(df['Close'], length=50)
    df['ATR'] = ta.atr(df['High'], df['Low'], df['Close'], length=14)
    df['Next_Close'] = df['Close'].shift(-1)
    df['Target'] = np.where(df['Next_Close'] > df['Close'], 1, 0)
    df.dropna(inplace=True)

    features = ['RSI', 'EMA_20', 'EMA_50', 'ATR', 'Volume']
    X = df[features]
    y = df['Target']

    # 3. Train Model
    split_idx = int(len(df) * 0.8)
    X_train = X.iloc[:split_idx]
    y_train = y.iloc[:split_idx]

    print("Training XGBoost Classifier...")
    model = xgb.XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=42)
    model.fit(X_train, y_train)

    # 4. Pull Live State (15-minute interval)
    print("Fetching live market candle...")
    latest_data = yf.download("GC=F", interval="15m", period="5d", auto_adjust=True)
    if isinstance(latest_data.columns, pd.MultiIndex):
        latest_data.columns = latest_data.columns.droplevel(1)
    latest_data = latest_data.astype(float)

    latest_data['RSI'] = ta.rsi(latest_data['Close'], length=14)
    latest_data['EMA_20'] = ta.ema(latest_data['Close'], length=20)
    latest_data['EMA_50'] = ta.ema(latest_data['Close'], length=50)
    latest_data['ATR'] = ta.atr(latest_data['High'], latest_data['Low'], latest_data['Close'], length=14)

    X_live = latest_data.iloc[-1:][features]
    prediction = model.predict(X_live)[0]
    action = "BUY" if prediction == 1 else "SELL"

    print(f"Generated AI Decision: {action}")
    print(f"Dispatching trade signal to: {WEBHOOK_URL}")

    # 5. Dispatch Signal to Render (Node.js handles the 10% SL math)
    response = requests.post(WEBHOOK_URL, json={"action": action, "volume": TRADE_VOLUME}, timeout=30)
    print(f"Gateway Response [{response.status_code}]: {response.text}")

if __name__ == "__main__":
    run_pipeline()
