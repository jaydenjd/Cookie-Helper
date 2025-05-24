from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)

# 数据库配置
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cookies.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 设置允许的token，实际应用中应该从环境变量或配置文件中读取
ALLOWED_TOKEN = os.getenv('COOKIE_HELPER_TOKEN', 'your-secret-token-here')

db = SQLAlchemy(app)

# Cookie记录模型
class CookieRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(500), nullable=False)
    cookies = db.Column(db.Text, nullable=False)  # JSON字符串
    client_ip = db.Column(db.String(50), nullable=False)
    token = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<CookieRecord {self.url}>'

# 请求日志模型
class RequestLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_ip = db.Column(db.String(50), nullable=False)
    token = db.Column(db.String(200), nullable=False)
    is_valid_token = db.Column(db.Boolean, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<RequestLog {self.client_ip}>'

# 创建数据库表
with app.app_context():
    db.create_all()

@app.route('/api/cookies', methods=['POST'])
def receive_cookies():
    # 获取客户端IP
    client_ip = request.remote_addr
    if request.headers.get('X-Forwarded-For'):
        client_ip = request.headers['X-Forwarded-For'].split(',')[0]

    # 获取请求数据
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # 验证必需字段
    required_fields = ['url', 'cookies', 'authorization']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    # 验证token
    token = data.get('authorization', '')
    is_valid_token = token == ALLOWED_TOKEN

    # 记录请求日志
    log = RequestLog(
        client_ip=client_ip,
        token=token,
        is_valid_token=is_valid_token
    )
    db.session.add(log)
    db.session.commit()

    # 如果token无效，返回错误
    if not is_valid_token:
        return jsonify({'error': 'Invalid token'}), 401

    try:
        # 保存Cookie记录
        record = CookieRecord(
            url=data['url'],
            cookies=str(data['cookies']),  # 将cookies列表转换为字符串存储
            client_ip=client_ip,
            token=token
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Cookies recorded successfully'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Failed to save record',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000) 