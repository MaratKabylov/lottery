-- Demo data are intentionally marked is_test and excluded from real draws.
insert into public.events(id,name,slug,description,status) values
('10000000-0000-0000-0000-000000000001','Открытие учебного центра','opening-2026',
 'Новый старт. Новые возможности. Зарегистрируйтесь и участвуйте в розыгрыше подарков!','active');
insert into public.prizes(event_id,name,quantity,sort_order) values
('10000000-0000-0000-0000-000000000001','Сертификат 20 000 ₸',3,0),
('10000000-0000-0000-0000-000000000001','Скидка 50%',5,1),
('10000000-0000-0000-0000-000000000001','Бесплатный курс',1,2),
('10000000-0000-0000-0000-000000000001','Фирменный подарок',5,3),
('10000000-0000-0000-0000-000000000001','Главный приз',1,4);
insert into public.participants(event_id,name,ticket_number,is_test)
select '10000000-0000-0000-0000-000000000001', 'Тестовый гость '||n,n,true from generate_series(1,10) n;
update public.event_ticket_counters set last_number=10 where event_id='10000000-0000-0000-0000-000000000001';
