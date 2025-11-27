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
  local icon = "󰊠"
  local m = H.hl("", mode_map[vim.api.nvim_get_mode().mode])
  return string.format("%s %s %s ", prefix, icon, m)
end

local filetype = function()
  return vim.bo.filetype
end

local function cwd()
  local dir = string.format("󰘍 %s/", vim.fn.fnamemodify(vim.fn.getcwd(), ":p:h:t"))
  return H.hl("Directory", dir)
end

local function d()
  local diagnostics = vim.diagnostic.get(0)
  local counts = vim.iter(diagnostics):fold({ 0, 0, 0, 0 }, function(acc, v)
    acc[v.severity] = acc[v.severity] + 1
    return acc
  end)
  local error_count = H.hl("DiagnosticError", string.format("󰃤 %d", counts[1]))
  local warning_count = H.hl("DiagnosticWarn", string.format("󰮯 %d", counts[2]))
  return string.format("%s %s", error_count, warning_count)
end

local lsp_progress_status = {
  client_id = nil,
  kind = nil,
  title = nil,
  message = nil,
  percentage = nil,
}

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
    elseif value.kind == "end" then
      lsp_progress_status = { client_id = nil, kind = nil, title = nil, message = nil, percentage = nil }
    end
  end,
})
local function lsp_progress()
  if lsp_progress_status.kind == nil then
    return ""
  end
  local client = vim.lsp.get_client_by_id(lsp_progress_status.client_id)
  local client_name = client and string.format("[%s]", client.name) or ""
  return string.format("%s %s %s...", client_name, lsp_progress_status.title or "", lsp_progress_status.message or "")
end

function Statusline.render()
  -- " %f %m %r %l:%c %p%%",
  return table.concat({
    mode(),
    " ",
    cwd(),
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
-- vim.o.laststatus = 3

vim.api.nvim_create_autocmd({
  "WinEnter",
  "BufEnter",
  "CursorMoved",
  "InsertEnter",
  "InsertLeave",
  "LspProgress",
  -- "DiagnosticChanged",
  "ModeChanged",
}, {
  group = vim.api.nvim_create_augroup("j/statusline_update", { clear = true }),
  callback = function()
    vim.cmd("redrawstatus")
  end,
})
