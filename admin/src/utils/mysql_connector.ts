import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const dataSource = new DataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: 'password',
  database: 'micro_service',
  entities: [__dirname + '/../entity/*.{js,ts}'],
  logging: false,
  synchronize: true,
});
