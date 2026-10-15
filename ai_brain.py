import os
import requests
import numpy as np
import pandas as pd
import pandas_ta as ta
import yfinance as yf
import xgboost as xgb

WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "https://my-trading-son.onrender.com/webhook")
TRADE_VOLUME = 200 

def run_pipeline():
    print("Fetching historical 15m Gold data...")
    df = yf.download("GC=F", interval="15m", period="60d", auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    df = df.astype(float)

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

    split_idx = int(len(df) * 0.8)
    X_train = X.iloc[:split_idx]
    y_train = y.iloc[:split_idx]

    print("Training XGBoost Classifier...")
    model = xgb.XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=42)
    model.fit(X_train, y_train)

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
    
    # 4. Generate Probabilities (Confidence) instead of binary 1/0
    probabilities = model.predict_proba(X_live)[0]
    prob_down = probabilities[0] 
    prob_up = probabilities[1]   
    
    # 5. Apply the "HOLD" Threshold Logic (65% confidence required)
    if prob_up >= 0.65:
        action = "BUY"
        confidence = prob_up
    elif prob_down >= 0.65:
        action = "SELL"
        confidence = prob_down
    else:
        action = "HOLD"
        confidence = max(prob_up, prob_down)

    print(f"AI Prediction: {action} (Confidence: {confidence:.1%})")

    if action == "HOLD":
        print("Market is too unpredictable right now. Holding.")
        return # Terminates script safely without sending a trade to Render

    print(f"Dispatching trade signal to: {WEBHOOK_URL}")

    # 6. Dispatch Signal
    response = requests.post(WEBHOOK_URL, json={"action": action, "volume": TRADE_VOLUME}, timeout=120)
    print(f"Gateway Response [{response.status_code}]: {response.text}")

if __name__ == "__main__":
    run_pipeline()
