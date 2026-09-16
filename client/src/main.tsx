import { render } from 'preact';
import './styles/base.css';
import './styles/room.css';
import './styles/mm.css';
import { App } from './ui/App';
import { boot } from './net/net';

render(<App />, document.getElementById('app')!);
boot();
