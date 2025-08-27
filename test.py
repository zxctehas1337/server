import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Конфигурация - ЭТО ТЕ САМЫЕ ПЕРЕМЕННЫЕ
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = "h7524714@gmail.com"  # Твой email (отправитель)
EMAIL_PASSWORD = "arpnfcoyemxmdxrm"  # Твой 16-значный пароль приложения (!)

# Создание письма
msg = MIMEMultipart()
msg['From'] = EMAIL_ADDRESS
msg['To'] = "genii5831@gmail.com"  # !!! Email получателя (ИСПРАВЛЕНО) !!!
msg['Subject'] = "Код подтверждения"

body = "Ваш код подтверждения: 123456"  # Здесь генерируй свой код
msg.attach(MIMEText(body, 'plain'))

# Отправка письма
try:
    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    server.starttls()  # Шифруем соединение
    server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
    text = msg.as_string()
    server.sendmail(EMAIL_ADDRESS, msg['To'], text)
    print("Письмо успешно отправлено!")
except Exception as e:
    print(f"Ошибка при отправке письма: {e}")
finally:
    server.quit()
