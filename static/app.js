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

  function loadSession(api) {
    currentSession = null;
    setCallButtonsEnabled(false);
    $('sessionTable').innerHTML = '<tr><td colspan="2">Cargando sesión...</td></tr>';

    api.getSession(function (session) {
      currentSession = session;
      renderSession(session);
      if (!$('rawPath').value) {
        $('rawPath').value = 'https://' + (session.server || 'my.geotab.com');
      }
      setCallButtonsEnabled(true);
    }, function (error) {
      $('sessionTable').innerHTML = '<tr><td colspan="2">Error obteniendo la sesión: ' + prettyPrint(error) + '</td></tr>';
    });
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
    },

    blur: function () {
      $('app').style.display = 'none';
      $('standaloneMsg').style.display = 'block';
    }
  };
};
