Winbar = {}
H = {}

function H.hl(hl_name, text)
  return string.format("%%#%s#%s%%*", hl_name, text)
end

Winbar.render = function(bufnr)
  local filepath = vim.api.nvim_buf_get_name(bufnr)
  local filename = vim.fn.fnamemodify(filepath, ":t")
  local ext = vim.fn.fnamemodify(filepath, ":e")
  local success, devicons = pcall(require, "nvim-web-devicons")
  local icon_hl = ""
  if success then
    local icon, hl = devicons.get_icon(filename, ext, { default = true })
    icon_hl = H.hl(hl, icon)
  end
  local modified = vim.bo[bufnr].modified
  local filename_hl = H.hl(modified and "Added" or "Title", filename .. (modified and "*" or ""))
  return table.concat({
    "%=",
    " ",
    icon_hl,
    " ",
    filename_hl,
  })
end

local excludes = {
  "fugitive",
  "lazy",
  "minipick",
  "minifiles",
  "codecompanion",
  "OverseerList",
  "OverseerForm",
  "snacks_input",
  "markdown",
}

vim.api.nvim_create_autocmd({ "BufEnter", "BufModifiedSet" }, {
  group = vim.api.nvim_create_augroup("j/winbar", { clear = true }),
  callback = function(event)
    if vim.tbl_contains(excludes, vim.bo.filetype) then
      return
    end

    vim.wo.winbar = Winbar.render(event.buf)
  end,
})
