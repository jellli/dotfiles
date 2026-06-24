local M = {}

M.hl = function(t)
	local parts = vim.tbl_map(function(item)
		if type(item) == "string" then
			return item
		else
			return string.format("%%#%s#%s%%*", item.hl, item.string)
		end
	end, t)
	return table.concat(parts, "")
end

M.get_buf_icon = function(bufnr)
	bufnr = bufnr or 0
	local icon, icon_hl = "", ""
	local ok, devicons = pcall(require, "nvim-web-devicons")
	if ok then
		icon, icon_hl = devicons.get_icon_by_filetype(vim.bo[bufnr].filetype, { default = true })
	end
	return icon, icon_hl
end

M.set_default_hl = function(name, data)
	if data.link then
		local hl = vim.api.nvim_get_hl(0, { name = data.link })
		if not vim.tbl_isempty(hl) then
			for key, value in pairs(data) do
				hl[key] = value
			end
			hl.link = nil
			data = hl
		end
	end
	data.default = true
	vim.api.nvim_set_hl(0, name, data)
end

return M
