geotab.addin.apiTester = function () {
  'use strict';

  var currentApi = null;
  var currentSession = null;

  function $(id) { return document.getElementById(id); }

  function prettyPrint(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return String(value);
    }
  }

  function maskSessionId(sessionId) {
    if (!sessionId || sessionId.length < 8) return sessionId;
    return sessionId.slice(0, 4) + '…' + sessionId.slice(-4);
  }

  function renderSession(session) {
    var table = $('sessionTable');
    var rows = [
      ['database', session.database],
      ['userName', session.userName],
      ['server', session.server],
      ['sessionId', maskSessionId(session.sessionId)]
    ];

    table.innerHTML = '';
    rows.forEach(function (pair) {
      var tr = document.createElement('tr');
      var tdKey = document.createElement('td');
      tdKey.textContent = pair[0];
      var tdVal = document.createElement('td');
      tdVal.textContent = pair[1] || '';
      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      table.appendChild(tr);
    });

    var revealRow = document.createElement('tr');
    var revealKey = document.createElement('td');
    revealKey.textContent = 'sessionId completo';
    var revealVal = document.createElement('td');
    var revealBtn = document.createElement('button');
    revealBtn.className = 'reveal';
    revealBtn.type = 'button';
    revealBtn.textContent = 'Mostrar';
    revealBtn.onclick = function () {
      revealVal.textContent = session.sessionId;
      revealBtn.style.display = 'none';
    };
    revealVal.appendChild(revealBtn);
    revealRow.appendChild(revealKey);
    revealRow.appendChild(revealVal);
    table.appendChild(revealRow);
  }

  function setCallButtonsEnabled(enabled) {
    $('apiCallBtn').disabled = !enabled;
    $('rawCallBtn').disabled = !enabled;
  }

  // ---------------------------------------------------------------
  // Consulta rápida por dispositivo
  // ---------------------------------------------------------------

  var allDevices = [];

  // Columnas resumidas por tipo. Cada columna: [título, función(registro)]
  function idOf(obj) { return obj && (obj.name || obj.id) || ''; }
  function fmtDate(d) { return d ? new Date(d).toLocaleString() : ''; }

  var COLUMNS = {
    LogRecord: [
      ['Fecha', function (r) { return fmtDate(r.dateTime); }],
      ['Lat', function (r) { return r.latitude; }],
      ['Lon', function (r) { return r.longitude; }],
      ['Vel (km/h)', function (r) { return r.speed; }]
    ],
    Trip: [
      ['Inicio', function (r) { return fmtDate(r.start); }],
      ['Fin', function (r) { return fmtDate(r.stop); }],
      ['Distancia (km)', function (r) { return r.distance != null ? r.distance.toFixed(2) : ''; }],
      ['Manejo', function (r) { return r.drivingDuration; }],
      ['Detenido', function (r) { return r.stopDuration; }],
      ['Vel máx', function (r) { return r.maximumSpeed; }],
      ['Conductor', function (r) { return idOf(r.driver); }]
    ],
    ExceptionEvent: [
      ['Desde', function (r) { return fmtDate(r.activeFrom); }],
      ['Hasta', function (r) { return fmtDate(r.activeTo); }],
      ['Regla', function (r) { return ruleNames[r.rule && r.rule.id] || idOf(r.rule); }],
      ['Duración', function (r) { return r.duration; }],
      ['Distancia', function (r) { return r.distance; }],
      ['Estado', function (r) { return r.state; }]
    ],
    StatusData: [
      ['Fecha', function (r) { return fmtDate(r.dateTime); }],
      ['Diagnóstico', function (r) { return idOf(r.diagnostic); }],
      ['Valor', function (r) { return r.data; }]
    ],
    FaultData: [
      ['Fecha', function (r) { return fmtDate(r.dateTime); }],
      ['Diagnóstico', function (r) { return idOf(r.diagnostic); }],
      ['Modo de falla', function (r) { return idOf(r.failureMode); }],
      ['Estado', function (r) { return r.faultState; }]
    ],
    DriverChange: [
      ['Fecha', function (r) { return fmtDate(r.dateTime); }],
      ['Conductor', function (r) { return idOf(r.driver); }],
      ['Tipo', function (r) { return r.type; }]
    ]
  };

  var ruleNames = {};

  function toLocalInput(date) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function setDefaultDates() {
    var now = new Date();
    var yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    if (!$('qFrom').value) $('qFrom').value = toLocalInput(yesterday);
    if (!$('qTo').value) $('qTo').value = toLocalInput(now);
  }

  function renderDeviceOptions() {
    var filter = $('devFilter').value.trim().toLowerCase();
    var select = $('devSelect');
    var previous = select.value;
    select.innerHTML = '';

    var shown = allDevices.filter(function (d) {
      if (!filter) return true;
      return (d.name || '').toLowerCase().indexOf(filter) >= 0 ||
        (d.serialNumber || '').toLowerCase().indexOf(filter) >= 0;
    });

    shown.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name + (d.serialNumber ? '  (' + d.serialNumber + ')' : '');
      select.appendChild(opt);
    });

    if (!shown.length) {
      select.innerHTML = '<option value="">Sin coincidencias</option>';
    } else if (previous) {
      select.value = previous;
    }
    $('devCount').textContent = shown.length + ' / ' + allDevices.length;
  }

  function loadDevices(api) {
    $('devSelect').innerHTML = '<option value="">Cargando dispositivos...</option>';

    // fromDate = ahora → solo dispositivos activos (no archivados)
    var params = {
      typeName: 'Device',
      search: { fromDate: new Date().toISOString() },
      propertySelector: { fields: ['id', 'name', 'serialNumber'], isIncluded: true }
    };

    var onOk = function (devices) {
      allDevices = (devices || []).sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
      renderDeviceOptions();
    };

    api.call('Get', params, onOk, function () {
      // Por si el servidor no soporta propertySelector, reintento sin él
      delete params.propertySelector;
      api.call('Get', params, onOk, function (err) {
        $('devSelect').innerHTML = '<option value="">Error cargando dispositivos</option>';
        $('qResult').textContent = 'Error:\n' + prettyPrint(err);
      });
    });

    // Nombres de reglas para mostrar en las excepciones
    api.call('Get', { typeName: 'Rule' }, function (rules) {
      ruleNames = {};
      (rules || []).forEach(function (r) { ruleNames[r.id] = r.name; });
    }, function () { /* no crítico */ });
  }

  function buildQueryParams() {
    var type = $('qType').value;
    var deviceId = $('devSelect').value;
    var fromVal = $('qFrom').value;
    var toVal = $('qTo').value;

    if (!deviceId) throw new Error('Elegí un dispositivo.');
    if (!fromVal || !toVal) throw new Error('Completá las fechas Desde / Hasta.');

    var search = {
      deviceSearch: { id: deviceId },
      fromDate: new Date(fromVal).toISOString(),
      toDate: new Date(toVal).toISOString()
    };

    if (type === 'Trip') {
      // incluye viajes que empezaron antes de "Desde" pero terminan dentro del rango
      search.includeOverlappedTrips = true;
    }

    var diag = $('qDiag').value.trim();
    if ((type === 'StatusData' || type === 'FaultData') && diag) {
      search.diagnosticSearch = { id: diag };
    }

    return {
      typeName: type,
      search: search,
      resultsLimit: parseInt($('qLimit').value, 10) || 500
    };
  }

  function renderTable(type, rows) {
    var table = $('qTable');
    table.innerHTML = '';
    var cols = COLUMNS[type];
    if (!cols || !rows.length) return;

    var thead = document.createElement('tr');
    cols.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c[0];
      thead.appendChild(th);
    });
    table.appendChild(thead);

    rows.slice(0, 200).forEach(function (r) {
      var tr = document.createElement('tr');
      cols.forEach(function (c) {
        var td = document.createElement('td');
        var v = c[1](r);
        td.textContent = v == null ? '' : v;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
  }

  function runQuery() {
    var params;
    try {
      params = buildQueryParams();
    } catch (e) {
      $('qStatus').textContent = e.message;
      return;
    }

    $('qParams').textContent = prettyPrint(params);
    $('qStatus').textContent = 'Consultando...';
    $('qTable').innerHTML = '';
    $('qResult').textContent = '';

    var t0 = Date.now();
    currentApi.call('Get', params, function (result) {
      var rows = result || [];
      var ms = Date.now() - t0;
      var msg = rows.length + ' registros en ' + ms + ' ms';
      if (rows.length >= params.resultsLimit) msg += ' (se alcanzó el límite)';
      if (rows.length > 200) msg += ' · tabla muestra los primeros 200';
      $('qStatus').textContent = msg;
      renderTable(params.typeName, rows);
      $('qResult').textContent = prettyPrint(rows);
    }, function (error) {
      $('qStatus').textContent = 'Error';
      $('qResult').textContent = 'Error:\n' + prettyPrint(error);
    });
  }

  function copyToGeneric() {
    try {
      $('apiMethod').value = 'Get';
      $('apiParams').value = prettyPrint(buildQueryParams());
      $('apiParams').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      $('qStatus').textContent = e.message;
    }
  }

  function onTypeChange() {
    var t = $('qType').value;
    $('diagRow').style.display = (t === 'StatusData' || t === 'FaultData') ? 'block' : 'none';
  }

  function loadSession(api) {
    currentSession = null;
    setCallButtonsEnabled(false);
    $('sessionTable').innerHTML = '<tr><td colspan="2">Cargando sesión...</td></tr>';

    try {
      api.getSession(function (session) {
        currentSession = session;
        renderSession(session);
        if (!$('rawPath').value) {
          $('rawPath').value = 'https://' + (session.server || 'my.geotab.com');
        }
        setCallButtonsEnabled(true);
      });
    } catch (e) {
      $('sessionTable').innerHTML = '<tr><td colspan="2">api.getSession() falló: ' + prettyPrint(e && e.message || e) + '</td></tr>';
    }
  }

  function runApiCall() {
    var method = $('apiMethod').value.trim();
    var resultEl = $('apiResult');
    var params;

    try {
      params = JSON.parse($('apiParams').value);
    } catch (e) {
      resultEl.textContent = 'JSON de parámetros inválido: ' + e.message;
      return;
    }

    resultEl.textContent = 'Ejecutando...';

    currentApi.call(method, params, function (result) {
      resultEl.textContent = prettyPrint(result);
    }, function (error) {
      resultEl.textContent = 'Error:\n' + prettyPrint(error);
    });
  }

  function buildRawHeaders() {
    return {
      'x-mygeotab-database': currentSession.database,
      'x-mygeotab-path': $('rawPath').value.trim(),
      'x-mygeotab-sessionid': currentSession.sessionId,
      'x-mygeotab-username': currentSession.userName,
      'Content-Type': 'application/json'
    };
  }

  function runRawCall() {
    var method = $('rawMethod').value;
    var url = $('rawUrl').value.trim();
    var bodyText = $('rawBody').value.trim();
    var statusEl = $('rawStatus');
    var resultEl = $('rawResult');

    if (!currentSession) {
      resultEl.textContent = 'Todavía no se cargó la sesión activa.';
      return;
    }

    var options = { method: method, headers: buildRawHeaders() };
    if (bodyText && (method === 'POST' || method === 'PUT')) {
      options.body = bodyText;
    }

    statusEl.textContent = 'Enviando...';
    resultEl.textContent = '';

    fetch(url, options)
      .then(function (response) {
        statusEl.textContent = 'HTTP ' + response.status + ' ' + response.statusText;
        return response.text();
      })
      .then(function (text) {
        if (!text) {
          resultEl.textContent = '(respuesta vacía)';
          return;
        }
        try {
          resultEl.textContent = prettyPrint(JSON.parse(text));
        } catch (e) {
          resultEl.textContent = text;
        }
      })
      .catch(function (error) {
        statusEl.textContent = 'Falló la petición (posible bloqueo CORS)';
        resultEl.textContent = String(error);
      });
  }

  function applyPreset(preset) {
    if (preset === 'get') {
      $('rawMethod').value = 'GET';
      $('rawUrl').value = 'https://media-services.geotab.com/api/DeviceMappings';
      $('rawBody').value = '';
    } else if (preset === 'post') {
      $('rawMethod').value = 'POST';
      $('rawUrl').value = 'https://media-services.geotab.com/DeviceMappings';
      $('rawBody').value = prettyPrint({
        partnerId: 'surfsight',
        partnerDeviceId: '357660105593735',
        associatedDeviceSerialNumber: 'G9Z8ZBFDMYZ6'
      });
    } else if (preset === 'delete') {
      $('rawMethod').value = 'DELETE';
      $('rawUrl').value = 'https://media-services.geotab.com/api/DeviceMappings/REPLACE_WITH_ID';
      $('rawBody').value = '';
    }
  }

  function wireEvents() {
    $('apiCallBtn').addEventListener('click', runApiCall);
    $('rawCallBtn').addEventListener('click', runRawCall);
    $('qRunBtn').addEventListener('click', runQuery);
    $('qCopyBtn').addEventListener('click', copyToGeneric);
    $('qType').addEventListener('change', onTypeChange);
    $('devFilter').addEventListener('input', renderDeviceOptions);

    var presetButtons = document.querySelectorAll('.presets button');
    for (var i = 0; i < presetButtons.length; i++) {
      presetButtons[i].addEventListener('click', function (event) {
        applyPreset(event.target.getAttribute('data-preset'));
      });
    }
  }

  var wired = false;

  return {
    initialize: function (api, state, callback) {
      currentApi = api;
      if (!wired) {
        wireEvents();
        wired = true;
      }
      callback();
    },

    focus: function (api, state) {
      currentApi = api;
      $('standaloneMsg').style.display = 'none';
      $('app').style.display = 'block';
      loadSession(api);
      setDefaultDates();
      if (!allDevices.length) loadDevices(api);
    },

    blur: function () {
      $('app').style.display = 'none';
      $('standaloneMsg').style.display = 'block';
    }
  };
};
