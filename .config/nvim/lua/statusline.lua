local icons = require("icons")
local mode_map = {
  ["n"] = "NORMAL",
  ["no"] = "OP-PENDING",
  ["nov"] = "OP-PENDING",
  ["noV"] = "OP-PENDING",
  ["no\22"] = "OP-PENDING",
  ["niI"] = "NORMAL",
  ["niR"] = "NORMAL",
  ["niV"] = "NORMAL",
  ["nt"] = "NORMAL",
  ["ntT"] = "NORMAL",
  ["v"] = "VISUAL",
  ["vs"] = "VISUAL",
  ["V"] = "VISUAL",
  ["Vs"] = "VISUAL",
  ["\22"] = "VISUAL",
  ["\22s"] = "VISUAL",
  ["s"] = "SELECT",
  ["S"] = "SELECT",
  ["\19"] = "SELECT",
  ["i"] = "INSERT",
  ["ic"] = "INSERT",
  ["ix"] = "INSERT",
  ["R"] = "REPLACE",
  ["Rc"] = "REPLACE",
  ["Rx"] = "REPLACE",
  ["Rv"] = "VIRT REPLACE",
  ["Rvc"] = "VIRT REPLACE",
  ["Rvx"] = "VIRT REPLACE",
  ["c"] = "COMMAND",
  ["cv"] = "VIM EX",
  ["ce"] = "EX",
  ["r"] = "PROMPT",
  ["rm"] = "MORE",
  ["r?"] = "CONFIRM",
  ["!"] = "SHELL",
  ["t"] = "TERMINAL",
}

Statusline = {}
Statusline.ns = vim.api.nvim_create_namespace("statusline")
Statusline.hls = {}

local H = {}

---@param name string
---@param opts vim.api.keyset.highlight
function H.create_hl(name, opts)
  if vim.tbl_contains(Statusline.hls, name) then
    return
  end
  vim.api.nvim_set_hl(0, name, opts)
end

function H.hl(hl_name, text)
  return string.format("%%#%s#%s%%*", hl_name, text)
end

local function mode()
  local prefix = H.hl("Cursor", " ")
  local m = H.hl("", mode_map[vim.api.nvim_get_mode().mode])
  return string.format("%s %s %s ", prefix, icons.misc.ghost, m)
end

local filetype = function()
  local devicons = require("nvim-web-devicons")
  local icon, hl = devicons.get_icon(vim.bo.filetype, vim.fn.fnamemodify(vim.fn.expand("%"), ":e"), { default = true })
  local icon_hl = H.hl(hl, icon)
  local ft = H.hl("Type", vim.bo.filetype:upper())
  return string.format("%s %s", icon_hl, ft)
end

local function d()
  local diagnostics = vim.diagnostic.get(0)
  local counts = vim.iter(diagnostics):fold({ 0, 0, 0, 0 }, function(acc, v)
    acc[v.severity] = acc[v.severity] + 1
    return acc
  end)
  local error_count = H.hl("DiagnosticError", string.format("%s %d", icons.diagnostics.ERROR, counts[1]))
  local warning_count = H.hl("DiagnosticWarn", string.format("%s %d", icons.diagnostics.WARN, counts[2]))
  return string.format("%s %s", error_count, warning_count)
end

local indicator_symbols = {
  "",
  "",
  "",
  "",
  "",
  "",
}
local lsp_progress_status = {
  client_id = nil,
  kind = nil,
  title = nil,
  message = nil,
  percentage = nil,
  indicator = nil,
}
local indicator_timer = nil

local function start_loading()
  if indicator_timer then
    return
  end
  indicator_timer = vim.loop.new_timer()
  local i = 1
  indicator_timer:start(
    0,
    120,
    vim.schedule_wrap(function()
      lsp_progress_status.indicator = i
      i = i % #indicator_symbols + 1
      vim.cmd("redrawstatus")
    end)
  )
end

local function stop_loading()
  if indicator_timer then
    indicator_timer:stop()
    indicator_timer:close()
    indicator_timer = nil
  end
  lsp_progress_status.indicator = nil
end

local lsp_progress_group = vim.api.nvim_create_augroup("j/lsp_progress", {
  clear = true,
})
vim.api.nvim_create_autocmd("LspProgress", {
  group = lsp_progress_group,
  pattern = { "begin", "end" },
  callback = function(ev)
    local value = ev.data.params.value
    if value.kind == "begin" then
      lsp_progress_status = value
      lsp_progress_status.client_id = ev.data.client_id
      start_loading()
    elseif value.kind == "end" then
      lsp_progress_status = {
        -- client_id = nil,
        kind = nil,
        title = nil,
        message = nil,
        percentage = nil,
        indicator = nil,
      }
      stop_loading()
    end
  end,
})

local client_name = ""
local function lsp_progress()
  local client = lsp_progress_status.client_id and vim.lsp.get_client_by_id(lsp_progress_status.client_id)
  if client and client.name then
    client_name = H.hl("ModeMsg", string.format(" %s %s", icons.symbol_kinds.Event, client.name))
  end
  local indicator = lsp_progress_status.indicator and indicator_symbols[lsp_progress_status.indicator] or ""
  local title = H.hl("Comment", lsp_progress_status.title or "")
  return string.format("%s %s %s", client_name, indicator, title)
end

local function git()
  local git_info = vim.b.gitsigns_status_dict
  if git_info == nil then
    return ""
  end
  local branch = H.hl("Visual", string.format(" %s %s ", icons.misc.git, git_info.head))
  local added = H.hl("GitSignsAdd", string.format("+%s", git_info.added))
  local changed = H.hl("GitSignsChange", string.format("~%s", git_info.changed))
  local removed = H.hl("GitSignsDelete", string.format("-%s", git_info.removed))
  return string.format("%s %s %s %s", branch, added, changed, removed)
end

function Statusline.render()
  -- " %f %m %r %l:%c %p%%",
  return table.concat({
    mode(),
    git(),
    " ",
    lsp_progress(),
    "%=",
    d(),
    " ",
    filetype(),
  })
end

H.create_hl("ModeNormal", { fg = "#000000", bg = "#ffffff" })
vim.o.statusline = "%!v:lua.Statusline.render()"
vim.o.laststatus = 3

local update_group = vim.api.nvim_create_augroup("j/statusline_update", { clear = false })
vim.api.nvim_create_autocmd({
  "LspProgress",
  "ModeChanged",
}, {
  group = update_group,
  callback = function()
    vim.cmd("redrawstatus")
  end,
})
