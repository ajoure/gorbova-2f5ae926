-- Add email templates for installment notifications
INSERT INTO email_templates (code, name, subject, body_html, variables, is_active) VALUES
('installment_upcoming', 'Напоминание о платеже по рассрочке', 'Напоминание о платеже {{dueDate}}', 
'<h1>📅 Напоминание о платеже</h1><p>Здравствуйте, {{name}}!</p><p>Напоминаем, что через 3 дня будет списан очередной платёж по рассрочке.</p><p><strong>Продукт:</strong> {{productName}}</p><p><strong>Сумма:</strong> {{amount}} {{currency}}</p><p><strong>Дата списания:</strong> {{dueDate}}</p><p><strong>Платёж:</strong> {{paymentNumber}} из {{totalPayments}}</p>',
'["name", "productName", "amount", "currency", "dueDate", "paymentNumber", "totalPayments"]', true),

('installment_success', 'Успешный платёж по рассрочке', 'Платёж по рассрочке прошёл успешно',
'<h1>✅ Платёж прошёл успешно</h1><p>Здравствуйте, {{name}}!</p><p>Платёж по рассрочке успешно списан.</p><p><strong>Продукт:</strong> {{productName}}</p><p><strong>Сумма:</strong> {{amount}} {{currency}}</p><p><strong>Платёж:</strong> {{paymentNumber}} из {{totalPayments}}</p>',
'["name", "productName", "amount", "currency", "paymentNumber", "totalPayments"]', true),

('installment_failed', 'Ошибка при списании по рассрочке', 'Ошибка при списании по рассрочке',
'<h1>❌ Ошибка при списании</h1><p>Здравствуйте, {{name}}!</p><p>К сожалению, не удалось списать платёж по рассрочке.</p><p><strong>Продукт:</strong> {{productName}}</p><p><strong>Сумма:</strong> {{amount}} {{currency}}</p><p><strong>Причина:</strong> {{errorMessage}}</p>',
'["name", "productName", "amount", "currency", "errorMessage"]', true)
ON CONFLICT (code) DO NOTHING;