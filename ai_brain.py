import os
import requests
import numpy as np
import pandas as pd
import pandas_ta as ta
import yfinance as yf
import xgboost as xgb
from sklearn.metrics import accuracy_score

# Uses the environment variable if set, otherwise falls back to your Render webhook
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "https://my-trading-son.onrender.com/webhook")

def run_pipeline():
    print("Fetching historical Gold data...")
    df = yf.download("GC=F", interval="1h", period="1y", auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    df = df.astype(float)

    # 1. Feature Engineering
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

    # 2. Train Model
    split_idx = int(len(df) * 0.8)
    X_train = X.iloc[:split_idx]
    y_train = y.iloc[:split_idx]

    print("Training XGBoost Classifier...")
    model = xgb.XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=42)
    model.fit(X_train, y_train)

    # 3. Pull Live State
    print("Fetching live market candle...")
    latest_data = yf.download("GC=F", interval="1h", period="5d", auto_adjust=True)
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

    # 4. Dispatch Signal
    response = requests.post(WEBHOOK_URL, json={"action": action, "volume": 100}, timeout=30)
    print(f"Gateway Response [{response.status_code}]: {response.text}")

if __name__ == "__main__":
    run_pipeline()